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
        // === Marca GenFeb (logo): navy + teal + lima ===
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
          50: "hsl(216 45% 97%)",
          100: "hsl(216 42% 92%)",
          200: "hsl(216 38% 82%)",
          300: "hsl(216 36% 68%)",
          400: "hsl(216 34% 52%)",
          500: "hsl(216 58% 28%)",
          600: "hsl(216 58% 22%)",
          700: "hsl(216 62% 18%)",
          800: "hsl(216 66% 14%)",
          900: "hsl(216 70% 10%)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
          50: "hsl(172 60% 96%)",
          100: "hsl(172 55% 88%)",
          200: "hsl(172 70% 76%)",
          300: "hsl(172 85% 62%)",
          400: "hsl(172 95% 48%)",
          500: "hsl(172 100% 36%)",
          600: "hsl(172 100% 30%)",
          700: "hsl(172 100% 24%)",
          800: "hsl(172 90% 18%)",
          900: "hsl(172 80% 12%)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
          50: "hsl(84 100% 96%)",
          100: "hsl(84 100% 90%)",
          200: "hsl(84 100% 80%)",
          300: "hsl(84 100% 68%)",
          400: "hsl(84 100% 54%)",
          500: "hsl(84 100% 44%)",
          600: "hsl(84 100% 36%)",
          700: "hsl(84 100% 28%)",
          800: "hsl(84 90% 22%)",
          900: "hsl(84 80% 16%)",
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
        /** Cuerpo alineado con service-hub (Quicksand) */
        sans: ["Quicksand", "Inter", "system-ui", "sans-serif"],
        display: ["Orbitron", "system-ui", "sans-serif"],
        /** Hero marketing — mismas fuentes que service-hub (Fredoka / Quicksand) */
        hero: ["Fredoka", "Inter", "system-ui", "sans-serif"],
        marketing: ["Quicksand", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        "glow-primary": "0 0 20px hsl(216 58% 24% / 0.28)",
        "glow-secondary": "0 0 20px hsl(172 100% 33% / 0.32)",
        "glow-accent": "0 0 20px hsl(84 100% 42% / 0.28)",
        "inner-glow": "inset 0 0 20px hsl(172 100% 33% / 0.12)",
      },
      backgroundImage: {
        "gradient-brand": "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%)",
        "gradient-mango": "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)",
        "gradient-leaf": "linear-gradient(135deg, hsl(var(--secondary)) 0%, hsl(var(--accent)) 100%)",
        "grid-pattern":
          "linear-gradient(hsl(172 100% 33% / 0.1) 1px, transparent 1px), linear-gradient(90deg, hsl(172 100% 33% / 0.1) 1px, transparent 1px)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
        "float": "float 6s ease-in-out infinite",
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 5px hsl(172 100% 33% / 0.2)" },
          "100%": { boxShadow: "0 0 20px hsl(172 100% 33% / 0.45)" },
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
