<script setup lang="ts">
import { ref } from 'vue';
import Button from 'primevue/button';
import Sidebar from 'primevue/sidebar';
</script>

<template>
  <div class="min-h-screen bg-luna-sky text-moon">
    <main class="pt-14">
      <router-view />
    </main>
  </div>
</template>
