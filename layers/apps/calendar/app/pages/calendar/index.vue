<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

interface CalendarEvent {
  day: number
  title: string
  color: 'primary' | 'success' | 'warning' | 'info' | 'error' | 'neutral'
}

const today = new Date()
const viewMonth = ref(today.getMonth())
const viewYear = ref(today.getFullYear())

const monthLabel = computed(() => {
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })
  return formatter.format(new Date(viewYear.value, viewMonth.value, 1))
})

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface DayCell {
  date: number
  inMonth: boolean
  isToday: boolean
  iso: string
}

const cells = computed<DayCell[]>(() => {
  const first = new Date(viewYear.value, viewMonth.value, 1)
  const startDay = first.getDay()
  const daysInMonth = new Date(viewYear.value, viewMonth.value + 1, 0).getDate()
  const prevDays = new Date(viewYear.value, viewMonth.value, 0).getDate()

  const out: DayCell[] = []
  for (let i = startDay - 1; i >= 0; i--) {
    const d = prevDays - i
    out.push({
      date: d,
      inMonth: false,
      isToday: false,
      iso: `${viewYear.value}-${viewMonth.value}-${d}-prev`
    })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday
      = d === today.getDate()
        && viewMonth.value === today.getMonth()
        && viewYear.value === today.getFullYear()
    out.push({
      date: d,
      inMonth: true,
      isToday,
      iso: `${viewYear.value}-${viewMonth.value}-${d}`
    })
  }
  while (out.length % 7 !== 0) {
    const d = out.length - (startDay + daysInMonth) + 1
    out.push({
      date: d,
      inMonth: false,
      isToday: false,
      iso: `${viewYear.value}-${viewMonth.value}-${d}-next`
    })
  }
  return out
})

const events: CalendarEvent[] = [
  { day: 3, title: 'Standup', color: 'primary' },
  { day: 7, title: 'Design review', color: 'info' },
  { day: 7, title: 'Lunch w/ Marcus', color: 'success' },
  { day: 12, title: 'Q2 retro', color: 'warning' },
  { day: 14, title: 'Dentist', color: 'neutral' },
  { day: 18, title: 'Ship cutoff', color: 'error' },
  { day: 21, title: 'All-hands', color: 'primary' },
  { day: 25, title: 'PTO', color: 'success' }
]

const eventsForDay = (day: number) => events.filter(e => e.day === day)

const prevMonth = () => {
  if (viewMonth.value === 0) {
    viewMonth.value = 11
    viewYear.value -= 1
  } else {
    viewMonth.value -= 1
  }
}
const nextMonth = () => {
  if (viewMonth.value === 11) {
    viewMonth.value = 0
    viewYear.value += 1
  } else {
    viewMonth.value += 1
  }
}
const goToday = () => {
  viewMonth.value = today.getMonth()
  viewYear.value = today.getFullYear()
}
</script>

<template>
  <div class="flex flex-col h-[calc(100vh-160px)] lg:h-[calc(100vh-130px)]">
    <header class="flex items-center justify-between mb-4 gap-2 flex-wrap">
      <div class="flex items-center gap-2">
        <h1 class="text-2xl font-semibold">
          {{ monthLabel }}
        </h1>
      </div>
      <div class="flex items-center gap-1">
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          @click="goToday"
        >
          Today
        </UButton>
        <UButton
          icon="i-lucide-chevron-left"
          variant="ghost"
          color="neutral"
          size="sm"
          aria-label="Previous month"
          @click="prevMonth"
        />
        <UButton
          icon="i-lucide-chevron-right"
          variant="ghost"
          color="neutral"
          size="sm"
          aria-label="Next month"
          @click="nextMonth"
        />
      </div>
    </header>

    <div class="grid grid-cols-7 border-t border-l border-(--ui-border) text-xs uppercase tracking-wider text-(--ui-text-muted) bg-(--ui-bg-elevated)">
      <div
        v-for="d in weekdays"
        :key="d"
        class="px-2 py-2 border-r border-b border-(--ui-border)"
      >
        {{ d }}
      </div>
    </div>

    <div class="grid grid-cols-7 border-l border-(--ui-border) flex-1 auto-rows-fr">
      <div
        v-for="cell in cells"
        :key="cell.iso"
        class="border-r border-b border-(--ui-border) p-2 min-h-24 flex flex-col gap-1"
        :class="cell.inMonth ? 'bg-(--ui-bg)' : 'bg-(--ui-bg-elevated)/40'"
      >
        <span
          class="text-sm self-start size-6 inline-flex items-center justify-center rounded-full"
          :class="[
            cell.isToday
              ? 'bg-(--ui-primary) text-white font-medium'
              : cell.inMonth
                ? 'text-(--ui-text)'
                : 'text-(--ui-text-muted)/50'
          ]"
        >
          {{ cell.date }}
        </span>
        <template v-if="cell.inMonth">
          <UBadge
            v-for="(ev, i) in eventsForDay(cell.date)"
            :key="i"
            :color="ev.color"
            variant="soft"
            size="sm"
            class="truncate justify-start max-w-full"
          >
            {{ ev.title }}
          </UBadge>
        </template>
      </div>
    </div>
  </div>
</template>
