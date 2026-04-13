import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

import {createApp} from 'vue'
import {createVuetify} from 'vuetify'

import App from './App.vue'
import './main.css'

const vuetify = createVuetify({
  theme: {
    defaultTheme: 'elrs',
    themes: {
      elrs: {
        dark: false,
        colors: {
          primary: '#4361c2',
          secondary: '#4fa49a',
          accent: '#9dc66b',
          background: '#eef5ee',
          surface: '#ffffff',
        },
      },
    },
  },
  defaults: {
    global: {
      density: 'comfortable',
    },
    VBtn: {
      rounded: 'xl',
    },
    VCard: {
      rounded: 'xl',
    },
    VTextField: {
      variant: 'outlined',
      density: 'comfortable',
    },
    VSelect: {
      variant: 'outlined',
      density: 'comfortable',
    },
  },
})

createApp(App).use(vuetify).mount('#app')
