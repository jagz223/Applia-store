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
        // Applia Store: tokens vía CSS vars (--primary / --secondary / --accent).
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
          50: "hsl(30 20% 97%)",
          100: "hsl(30 16% 92%)",
          200: "hsl(28 14% 82%)",
          300: "hsl(26 12% 62%)",
          400: "hsl(25 14% 40%)",
          500: "hsl(25 18% 22%)",
          600: "hsl(25 18% 18%)",
          700: "hsl(25 20% 14%)",
          800: "hsl(25 22% 11%)",
          900: "hsl(25 24% 8%)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
          50: "hsl(8 60% 96%)",
          100: "hsl(8 55% 90%)",
          200: "hsl(8 58% 80%)",
          300: "hsl(8 62% 68%)",
          400: "hsl(8 68% 58%)",
          500: "hsl(8 72% 52%)",
          600: "hsl(8 68% 44%)",
          700: "hsl(8 65% 36%)",
          800: "hsl(8 60% 28%)",
          900: "hsl(8 55% 20%)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
          50: "hsl(30 22% 97%)",
          100: "hsl(30 18% 92%)",
          200: "hsl(30 16% 86%)",
          300: "hsl(30 14% 78%)",
          400: "hsl(30 12% 68%)",
          500: "hsl(30 14% 58%)",
          600: "hsl(30 12% 46%)",
          700: "hsl(28 12% 36%)",
          800: "hsl(26 12% 28%)",
          900: "hsl(25 14% 20%)",
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
        sans: ["Outfit", "system-ui", "sans-serif"],
        display: ["Outfit", "system-ui", "sans-serif"],
        hero: ["Outfit", "system-ui", "sans-serif"],
        marketing: ["Outfit", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        "glow-primary": "0 0 20px hsl(var(--primary) / 0.22)",
        "glow-secondary": "0 0 20px hsl(var(--secondary) / 0.22)",
        "glow-accent": "0 0 20px hsl(var(--accent) / 0.22)",
        "inner-glow": "inset 0 0 20px hsl(var(--secondary) / 0.1)",
      },
      backgroundImage: {
        "gradient-brand": "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%)",
        "gradient-mango": "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)",
        "gradient-leaf": "linear-gradient(135deg, hsl(var(--secondary)) 0%, hsl(var(--accent)) 100%)",
        "grid-pattern":
          "linear-gradient(hsl(var(--primary) / 0.08) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary) / 0.08) 1px, transparent 1px)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
        "float": "float 6s ease-in-out infinite",
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 5px hsl(var(--secondary) / 0.15)" },
          "100%": { boxShadow: "0 0 16px hsl(var(--secondary) / 0.3)" },
        },
        float: {
          "0%, 100%": { transform: "translate3d(0, 0, 0)" },
          "50%": { transform: "translate3d(0, -12px, 0)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
