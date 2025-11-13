<template>
  <div class="fullscreen bg-blue text-white text-center q-pa-md flex flex-center">
    <div>
      <div style="font-size: 30vh">404</div>

      <div class="text-h2" style="opacity: 0.4">Oops. Nothing here...</div>

      <RouterLink to="/">
        <Button label="Go Home" icon="pi pi-home" class="mt-8" />
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from 'primevue/button';
</script>
