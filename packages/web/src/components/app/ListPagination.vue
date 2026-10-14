<script setup lang="ts">
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@kinora/ui/pagination'
import { ChevronLeft, ChevronRight } from '@lucide/vue'

// Total count and page links under a paged list; renders nothing when everything fits on one page.
defineProps<{ total: number, pageSize: number, page: number, noun: string }>()
defineEmits<{ 'update:page': [page: number] }>()
</script>

<template>
  <div v-if="total > pageSize" class="flex items-center justify-between gap-4">
    <span class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      {{ total }} {{ noun }}
    </span>
    <Pagination
      :total="total"
      :items-per-page="pageSize"
      :page="page"
      :sibling-count="1"
      show-edges
      class="mx-0 w-auto font-mono"
      @update:page="(p: number) => $emit('update:page', p)"
    >
      <PaginationContent v-slot="{ items }" class="gap-0.5">
        <PaginationPrevious size="icon-sm" class="text-muted-foreground">
          <ChevronLeft class="size-3.5" />
        </PaginationPrevious>
        <template v-for="(item, i) in items" :key="i">
          <PaginationItem
            v-if="item.type === 'page'"
            :value="item.value"
            :is-active="item.value === page"
            size="icon-sm"
            class="text-xs tabular-nums"
            :class="item.value === page ? '' : 'text-muted-foreground'"
          >
            {{ item.value }}
          </PaginationItem>
          <PaginationEllipsis v-else :index="i" class="size-8 text-muted-foreground" />
        </template>
        <PaginationNext size="icon-sm" class="text-muted-foreground">
          <ChevronRight class="size-3.5" />
        </PaginationNext>
      </PaginationContent>
    </Pagination>
  </div>
</template>
