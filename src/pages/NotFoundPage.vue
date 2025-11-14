<template>
  <div class="w-full h-full bg-primary-500 text-white text-center p-4 flex items-center justify-center">
    <div>
      <div style="font-size: 30vh">404</div>

      <div class="text-2xl" style="opacity: 0.4">Oops. Nothing here...</div>

      <RouterLink to="/">
        <Button label="Go Home" icon="pi pi-home" class="mt-8" />
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from 'primevue/button';
</script>
