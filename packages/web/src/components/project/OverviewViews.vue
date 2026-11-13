<script setup lang="ts">
import type { OverviewFilters, OverviewView } from '@/lib/overview-filters'
import { Button } from '@kinora/ui/button'
import { Input } from '@kinora/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@kinora/ui/popover'
import { SegmentedControl } from '@kinora/ui/segmented-control'
import { Plus, X } from '@lucide/vue'
import { computed, ref } from 'vue'
import CopyLinkButton from '@/components/app/CopyLinkButton.vue'
import { NO_FILTERS, sameFilters, viewSlug } from '@/lib/overview-filters'

const props = defineProps<{ views: OverviewView[], filters: OverviewFilters, active?: OverviewView }>()
const emit = defineEmits<{ clear: [], select: [view: OverviewView], save: [name: string], delete: [name: string] }>()

const ALL = '\0all'
const options = computed(() => [{ value: ALL, label: 'All' }, ...props.views.map(v => ({ value: v.name, label: v.name }))])
const unfiltered = computed(() => sameFilters(props.filters, NO_FILTERS))
const selected = computed(() => props.active?.name ?? (unfiltered.value ? ALL : ''))

function select(value: string) {
  if (value === ALL)
    emit('clear')
  else
    emit('select', props.views.find(v => v.name === value)!)
}

const saving = ref(false)
const name = ref('')

function save() {
  const n = viewSlug(name.value)
  if (!n)
    return
  emit('save', n)
  name.value = ''
  saving.value = false
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <SegmentedControl :model-value="selected" :options="options" aria-label="Views" @update:model-value="select" />

    <template v-if="active">
      <CopyLinkButton />
      <Button
        variant="ghost"
        size="icon-sm"
        class="text-muted-foreground"
        :aria-label="`Delete view ${active.name}`"
        :title="`Delete view ${active.name}`"
        @click="emit('delete', active.name)"
      >
        <X class="size-3.5" />
      </Button>
    </template>

    <Popover v-else-if="!unfiltered" v-model:open="saving">
      <PopoverTrigger as-child>
        <Button variant="ghost" size="sm" class="h-8 font-mono text-xs text-muted-foreground">
          <Plus class="size-3.5" /> Save view
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-64" align="start">
        <form class="flex gap-2" @submit.prevent="save">
          <Input v-model="name" placeholder="marvel" aria-label="View name" class="h-8 font-mono text-xs" maxlength="40" />
          <Button type="submit" size="sm" class="h-8 font-mono text-xs" :disabled="!viewSlug(name)">
            Save
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  </div>
</template>
