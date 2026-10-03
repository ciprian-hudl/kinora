import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { trpc } from '@/lib/trpc'

export function useProjectAdmin(projectId: string) {
  const savingGeneral = ref(false)
  const savingCodeowners = ref(false)
  const deleting = ref(false)

  async function saveGeneral(input: { name: string, description: string }): Promise<boolean> {
    savingGeneral.value = true
    try {
      await trpc.project.rename.mutate({ projectId, name: input.name })
      await trpc.project.updateDescription.mutate({ projectId, description: input.description })
      toast.success('Project updated')
      return true
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update project')
      return false
    }
    finally {
      savingGeneral.value = false
    }
  }

  async function saveCodeowners(text: string): Promise<boolean> {
    savingCodeowners.value = true
    try {
      await trpc.project.updateCodeowners.mutate({ projectId, text })
      toast.success('Code owners updated')
      return true
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update code owners')
      return false
    }
    finally {
      savingCodeowners.value = false
    }
  }

  async function deleteProject(): Promise<boolean> {
    deleting.value = true
    try {
      await trpc.project.delete.mutate({ projectId })
      toast.success('Project deleted')
      return true
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete project')
      deleting.value = false
      return false
    }
  }

  return { savingGeneral, savingCodeowners, deleting, saveGeneral, saveCodeowners, deleteProject }
}
