/**
 * Centralized styles for the post-checkout "Order placed" panel.
 * Uses CSS variables so it remains readable in both light and dark mode.
 */
const successStyles = {
  container: {
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 16,
    background: "rgba(16,185,129,0.08)", // subtle green tint; works on both themes
    color: "var(--foreground)",
  },

  orderIdCode: {
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--foreground)",
    fontWeight: 900,
  },

  neutralButton: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--button-bg)",
    color: "var(--foreground)",
    fontWeight: 900,
    cursor: "pointer",
  },

  nextStepsBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--foreground)",
  },

  stepsList: {
    margin: 0,
    paddingLeft: 18,
    color: "var(--foreground)",
    display: "grid",
    gap: 6,
  },

  subtleCode: {
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--card-2)",
    color: "var(--foreground)",
    fontWeight: 900,
  },

  primaryButton: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--foreground)",   // flips automatically by theme
    color: "var(--background)",
    fontWeight: 950,
    cursor: "pointer",
  },
};

module.exports = { successStyles };
