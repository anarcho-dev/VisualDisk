module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts}"],
  theme: {
    extend: {
      colors: {
        ink: "#0d1117",
        graphite: "#121826",
        mist: "#d5d9e4",
        neon: "#29f3c3",
        ember: "#ff784f",
        steel: "#1f2a44"
      },
      boxShadow: {
        glow: "0 0 30px rgba(41, 243, 195, 0.25)"
      }
    }
  },
  plugins: []
};
