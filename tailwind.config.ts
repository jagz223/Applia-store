import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: ".5625rem",
        md: ".375rem",
        sm: ".1875rem",
      },
      colors: {
        // === Mango Brand Palette ===
        // Primary - Naranja mango intenso
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
          50: "hsl(35 100% 95%)",
          100: "hsl(35 100% 90%)",
          200: "hsl(35 100% 80%)",
          300: "hsl(35 100% 70%)",
          400: "hsl(35 100% 60%)",
          500: "hsl(35 100% 55%)",
          600: "hsl(35 100% 50%)",
          700: "hsl(35 100% 45%)",
          800: "hsl(35 100% 35%)",
          900: "hsl(35 100% 25%)",
        },
        // Secondary - Verde aqua/leaf
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
          50: "hsl(174 63% 87%)",
          100: "hsl(174 63% 77%)",
          200: "hsl(174 63% 67%)",
          300: "hsl(174 63% 57%)",
          400: "hsl(174 63% 52%)",
          500: "hsl(174 63% 47%)",
          600: "hsl(174 63% 42%)",
          700: "hsl(174 63% 37%)",
          800: "hsl(174 63% 27%)",
          900: "hsl(174 63% 17%)",
        },
        // Accent - Amarillo-naranja suave
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
          50: "hsl(34 100% 91%)",
          100: "hsl(34 100% 86%)",
          200: "hsl(34 100% 81%)",
          300: "hsl(34 100% 76%)",
          400: "hsl(34 100% 73%)",
          500: "hsl(34 100% 71%)",
          600: "hsl(34 100% 66%)",
          700: "hsl(34 100% 61%)",
          800: "hsl(34 100% 51%)",
          900: "hsl(34 100% 41%)",
        },
        // Background & Foreground
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        
        // Muted
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        
        // Card
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
          border: "hsl(var(--card-border) / <alpha-value>)",
        },
        
        // Popover
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
          border: "hsl(var(--popover-border) / <alpha-value>)",
        },
        
        // Input & Border
        input: "hsl(var(--input) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        
        // Semantic colors
        success: {
          DEFAULT: "hsl(var(--success) / <alpha-value>)",
          foreground: "hsl(var(--success-foreground) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "hsl(var(--warning) / <alpha-value>)",
          foreground: "hsl(var(--warning-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        
        // Ring
        ring: "hsl(var(--ring) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Orbitron", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        "glow-primary": "0 0 20px rgba(255, 159, 28, 0.3)",
        "glow-secondary": "0 0 20px rgba(46, 196, 182, 0.3)",
        "glow-accent": "0 0 20px rgba(255, 191, 105, 0.3)",
        "inner-glow": "inset 0 0 20px rgba(255, 159, 28, 0.1)",
      },
      backgroundImage: {
        "gradient-brand": "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%)",
        "gradient-mango": "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)",
        "gradient-leaf": "linear-gradient(135deg, hsl(var(--secondary)) 0%, hsl(var(--accent)) 100%)",
        "grid-pattern": "linear-gradient(rgba(255, 159, 28, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 159, 28, 0.1) 1px, transparent 1px)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
        "float": "float 6s ease-in-out infinite",
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 5px rgba(255, 159, 28, 0.2)" },
          "100%": { boxShadow: "0 0 20px rgba(255, 159, 28, 0.4)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
