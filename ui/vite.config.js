import { defineConfig } from 'vite'


export default defineConfig(({ command }) => {
  return {
    build: {
      target: 'esnext',
    },
  }
})
