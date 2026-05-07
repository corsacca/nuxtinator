<template>
  <div class="min-h-screen flex flex-col bg-(--ui-bg)">
    <div class="flex justify-end p-4">
      <ThemeToggle />
    </div>
    <div class="flex-1 flex items-center justify-center px-4 pb-12">
      <div class="w-full max-w-md">
        <slot />
      </div>
    </div>
  </div>
</template>
