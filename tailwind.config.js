/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        vault: {
          bg: '#0a0e1a',
          surface: '#0f1420',
          cyan: '#22d3ee',
          magenta: '#d946ef',
        },
      },
      backgroundImage: {
        'vault-gradient': 'linear-gradient(135deg, #22d3ee 0%, #d946ef 100%)',
      },
    },
  },
  plugins: [],
}
