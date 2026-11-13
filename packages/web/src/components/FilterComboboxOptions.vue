<script setup lang="ts">
import { CommandGroup, CommandItem, useCommand } from '@kinora/ui/command'
import { cn } from '@kinora/ui/utils'
import { Check } from '@lucide/vue'
import { computed } from 'vue'
import { rankOptions } from '@/lib/rank-options'

const props = defineProps<{ options: string[], allLabel: string, selected: string }>()
const emit = defineEmits<{ select: [value: string] }>()

const { filterState } = useCommand()
const ranked = computed(() => rankOptions(props.options, filterState.search))
</script>

<template>
  <div v-if="filterState.search && !ranked.length" class="py-4 text-center font-mono text-xs text-muted-foreground">
    No match.
  </div>
  <CommandGroup v-else>
    <CommandItem v-if="!filterState.search" value="all" class="font-mono text-xs" @select="() => emit('select', 'all')">
      <Check :class="cn('size-3.5 shrink-0', selected === 'all' ? 'opacity-100' : 'opacity-0')" />
      {{ allLabel }}
    </CommandItem>
    <CommandItem
      v-for="o in ranked"
      :key="o"
      :value="o"
      class="font-mono text-xs"
      @select="() => emit('select', o)"
    >
      <Check :class="cn('size-3.5 shrink-0', selected === o ? 'opacity-100' : 'opacity-0')" />
      <span class="truncate">{{ o }}</span>
    </CommandItem>
  </CommandGroup>
</template>
