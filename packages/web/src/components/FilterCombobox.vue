<script setup lang="ts">
import { Button } from '@kinora/ui/button'
import { Command, CommandInput, CommandList } from '@kinora/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@kinora/ui/popover'
import { cn } from '@kinora/ui/utils'
import { ChevronsUpDown } from '@lucide/vue'
import { ref } from 'vue'
import FilterComboboxOptions from './FilterComboboxOptions.vue'

const props = defineProps<{
  options: string[]
  allLabel: string
  searchPlaceholder: string
  triggerClass?: string
  align?: 'start' | 'end'
}>()

// 'all' or a concrete option.
const model = defineModel<string>({ required: true })
const open = ref(false)

function select(value: string) {
  model.value = value
  open.value = false
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <slot name="trigger" :open="open">
        <Button
          variant="outline"
          role="combobox"
          :aria-expanded="open"
          :class="cn('h-9 justify-between gap-2 font-mono text-xs font-normal', props.triggerClass)"
        >
          <span class="truncate">{{ model === 'all' ? props.allLabel : model }}</span>
          <ChevronsUpDown class="size-3.5 shrink-0 opacity-50" />
        </Button>
      </slot>
    </PopoverTrigger>
    <PopoverContent class="w-72 p-0" :align="props.align ?? 'end'">
      <!-- Ranked here, not by the command's own filter: an exact match leads, then the given order. -->
      <Command :should-filter="false">
        <CommandInput :placeholder="props.searchPlaceholder" class="font-mono text-xs" />
        <CommandList class="max-h-72">
          <FilterComboboxOptions :options="props.options" :all-label="props.allLabel" :selected="model" @select="select" />
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
