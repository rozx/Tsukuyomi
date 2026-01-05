<script setup lang="ts">
import { RouterLink } from 'vue-router';
import Button from 'primevue/button';
</script>

<template>
  <div class="w-full h-full bg-night-900 text-moon text-center p-4 flex items-center justify-center">
    <div>
      <div style="font-size: 30vh">404</div>

      <div class="text-2xl" style="opacity: 0.4">Oops. Nothing here...</div>

      <RouterLink to="/">
        <Button label="Go Home" icon="pi pi-home" class="mt-8" />
      </RouterLink>
    </div>
  </div>
</template>
