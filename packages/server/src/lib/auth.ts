import { randomUUID } from 'node:crypto'
import { apiKey } from '@better-auth/api-key'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, bearer, deviceAuthorization, lastLoginMethod, organization } from 'better-auth/plugins'
import { genericOAuth, okta } from 'better-auth/plugins/generic-oauth'
import { and, eq } from 'drizzle-orm'
import { polarAuthPlugin, polarClient } from '../billing/polar'
import { db } from '../db'
import { member, organization as organizationTable } from '../db/schemas/index'
import { purgeUserOwnedData } from './account'
import { demo, env, githubOauthEnabled, googleOauthEnabled, oktaEnabled, passwordLoginEnabled } from './env'
import { logger } from './logger'
import { mailerEnabled, sendMail } from './mailer'
import { getTrustedOrigins } from './utils'

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'team'
}

const polarPlugin = polarAuthPlugin()

// Adds the user to DEFAULT_ORG_SLUG (if configured) and returns its id, so everyone lands in one shared workspace.
async function joinDefaultOrganization(userId: string): Promise<string | null> {
  if (!env.DEFAULT_ORG_SLUG)
    return null
  const shared = await db.query.organization.findFirst({
    where: eq(organizationTable.slug, env.DEFAULT_ORG_SLUG),
    columns: { id: true },
  })
  if (!shared) {
    logger.warn({ slug: env.DEFAULT_ORG_SLUG }, 'DEFAULT_ORG_SLUG does not match an organization')
    return null
  }
  const existing = await db.query.member.findFirst({
    where: and(eq(member.organizationId, shared.id), eq(member.userId, userId)),
    columns: { id: true },
  })
  if (!existing)
    await db.insert(member).values({ id: randomUUID(), organizationId: shared.id, userId, role: 'member' })
  return shared.id
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  baseURL: env.BASE_URL,
  trustedOrigins: getTrustedOrigins(),
  emailAndPassword: {
    enabled: passwordLoginEnabled,
    sendResetPassword: async ({ user, url }) => {
      sendMail({
        to: user.email,
        subject: 'Reset your kinora password',
        text: `Hi${user.name ? ` ${user.name}` : ''},\n\nSomeone requested a password reset for your kinora account. Click the link below to choose a new password:\n\n${url}\n\nThe link expires in 1 hour. If you didn't ask for this, you can safely ignore this email.`,
      })
    },
  },
  emailVerification: {
    sendOnSignUp: mailerEnabled,
    sendVerificationEmail: async ({ user, url }) => {
      sendMail({
        to: user.email,
        subject: 'Verify your kinora email',
        text: `Hi${user.name ? ` ${user.name}` : ''},\n\nConfirm this address for your kinora account by clicking the link below:\n\n${url}\n\nIf you didn't create a kinora account, you can safely ignore this email.`,
      })
    },
  },
  socialProviders: {
    ...(googleOauthEnabled ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } } : {}),
    ...(githubOauthEnabled ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } } : {}),
  },
  // Okta asserts the email, so an existing password account links on first SSO sign-in instead of erroring.
  // Without SMTP those accounts were never email-verified; with password signup off no new unverified ones can appear.
  ...(oktaEnabled
    ? { account: { accountLinking: { trustedProviders: ['okta'], requireLocalEmailVerified: passwordLoginEnabled } } }
    : {}),
  user: {
    deleteUser: {
      enabled: true,
      // Fresh session or password required by better-auth; we just clean up owned data first.
      beforeDelete: async (u) => {
        await purgeUserOwnedData(u.id)
        if (polarClient) {
          try {
            await polarClient.customers.deleteExternal({ externalId: u.id })
          }
          catch (error) {
            logger.warn({ error, userId: u.id }, 'polar customer deletion skipped')
          }
        }
      },
    },
    changeEmail: {
      enabled: true,
      updateEmailWithoutVerification: !mailerEnabled,
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        sendMail({
          to: user.email,
          subject: 'Approve your kinora email change',
          text: `Hi${user.name ? ` ${user.name}` : ''},\n\nApprove changing your kinora email to ${newEmail} by clicking the link below:\n\n${url}\n\nIf you didn't request this, ignore this email and your address stays the same.`,
        })
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Every account owns one personal organization; projects + billing live on it.
        after: async (createdUser) => {
          const orgId = randomUUID()
          const base = slugify(createdUser.name || createdUser.email.split('@')[0] || 'team')
          await db.insert(organizationTable).values({
            id: orgId,
            name: createdUser.name ? `${createdUser.name}'s workspace` : 'My workspace',
            slug: `${base}-${randomUUID().slice(0, 8)}`,
          })
          await db.insert(member).values({
            id: randomUUID(),
            organizationId: orgId,
            userId: createdUser.id,
            role: 'owner',
          })

          if (polarClient) {
            try {
              await polarClient.customers.create({ email: createdUser.email, name: createdUser.name, externalId: createdUser.id })
            }
            catch (error) {
              logger.warn({ error, userId: createdUser.id }, 'polar customer creation skipped')
            }
          }
        },
      },
    },
    session: {
      create: {
        // Default the session to the org the user owns (a user may also be a member of others).
        before: async (session) => {
          const sharedOrgId = await joinDefaultOrganization(session.userId)
          const owned = await db.query.member.findFirst({
            where: and(eq(member.userId, session.userId), eq(member.role, 'owner')),
            columns: { organizationId: true },
          })
          return { data: { ...session, activeOrganizationId: sharedOrgId ?? owned?.organizationId ?? null } }
        },
      },
    },
  },
  advanced: {
    ...(env.COOKIE_DOMAIN ? { crossSubDomainCookies: { enabled: true, domain: env.COOKIE_DOMAIN } } : {}),
    // Demo runs on a *.kinora.dev subdomain next to prod; a distinct cookie name stops prod's
    ...(demo ? { cookiePrefix: 'kinora-demo' } : {}),
  },
  secret: env.AUTH_SECRET,
  plugins: [
    // Plugin default is 10 req/day per key, which any real CI exceeds, billing quotas already cap ingest volume.
    apiKey({ rateLimit: { enabled: false } }),
    bearer(),
    // schema: {} works around better-auth 1.6.14 requiring the (otherwise-optional) schema option.
    deviceAuthorization({ schema: {}, verificationUri: `${env.WEB_ORIGIN}/device` }),
    lastLoginMethod(),
    organization({
      // Only the auto-created personal org exists; members can't spin up extra orgs.
      allowUserToCreateOrganization: false,
      sendInvitationEmail: async (data) => {
        // The UI also surfaces the accept link from the invite response, so no-SMTP setups still work.
        logger.info({ invitationId: data.id, email: data.email, org: data.organization.name }, 'org invitation created')
        const inviter = data.inviter.user.name || data.inviter.user.email
        sendMail({
          to: data.email,
          subject: `Join ${data.organization.name} on kinora`,
          text: `${inviter} invited you to the "${data.organization.name}" workspace on kinora.\n\nAccept the invitation:\n\n${env.WEB_ORIGIN}/accept-invite/${data.id}\n\nIf you weren't expecting this, you can safely ignore this email.`,
        })
      },
    }),
    admin(),
    ...(oktaEnabled
      ? [genericOAuth({ config: [okta({ issuer: env.OKTA_ISSUER, clientId: env.OKTA_CLIENT_ID, clientSecret: env.OKTA_CLIENT_SECRET, pkce: true })] })]
      : []),
    ...(polarPlugin ? [polarPlugin] : []),
  ],
})

export interface AuthType {
  user: typeof auth.$Infer.Session.user | null
  session: typeof auth.$Infer.Session.session | null
}
