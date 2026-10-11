<script setup lang="ts">
import { Command } from '@kinora/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@kinora/ui/dialog'
import { useEventListener } from '@vueuse/core'
import { useCommandPalette } from '@/composables/useCommandPalette'
import CommandPaletteList from './CommandPaletteList.vue'

const { open } = useCommandPalette()

useEventListener(window, 'keydown', (event) => {
  if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey)
    return
  event.preventDefault()
  open.value = !open.value
})
</script>

<template>
  <Dialog v-model:open="open">
    <!-- Anchored near the top instead of centered: the list grows and shrinks as you type, and
         a centered dialog would move the input with it. -->
    <DialogContent :show-close-button="false" class="top-[14%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl">
      <DialogHeader class="sr-only">
        <DialogTitle>Command palette</DialogTitle>
        <DialogDescription>Search projects, runs and tests, or run a command.</DialogDescription>
      </DialogHeader>
      <!-- The list filters and orders itself: it mixes local commands with server results. -->
      <Command :should-filter="false" class="[&_[data-slot=command-input-wrapper]]:h-11">
        <CommandPaletteList />
      </Command>
    </DialogContent>
  </Dialog>
</template>
