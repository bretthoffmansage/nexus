/**
 * Clerk appearance tuned for the Nexus auth card.
 * Keeps Clerk-owned fields while matching Nexus tokens and removing duplicate card chrome.
 */
export const nexusClerkAppearance = {
  variables: {
    colorPrimary: "#e06c75",
    colorText: "#9cdef2",
    colorTextSecondary: "color-mix(in srgb, #9cdef2 55%, #282c34)",
    colorBackground: "#151a20",
    colorInputBackground: "color-mix(in srgb, #111111 70%, black)",
    colorInputText: "#9cdef2",
    borderRadius: "6px",
    fontFamily: "var(--nexus-font-sans)",
  },
  elements: {
    rootBox: {
      width: "100%",
      maxWidth: "100%",
    },
    cardBox: {
      width: "100%",
      maxWidth: "100%",
    },
    card: {
      background: "transparent",
      border: "none",
      boxShadow: "none",
      padding: "0",
      gap: "0.75rem",
    },
    headerTitle: {
      display: "none",
    },
    headerSubtitle: {
      display: "none",
    },
    socialButtonsBlockButton: {
      borderColor: "#355a66",
      background: "color-mix(in srgb, #111111 88%, #282c34)",
      color: "#9cdef2",
    },
    formButtonPrimary: {
      background: "color-mix(in srgb, #e06c75 35%, #111111)",
      border: "1px solid #355a66",
      boxShadow: "none",
    },
    formFieldInput: {
      borderColor: "#355a66",
    },
    footerActionLink: {
      color: "#e06c75",
    },
    identityPreview: {
      borderColor: "#355a66",
      background: "color-mix(in srgb, #111111 88%, #282c34)",
    },
    formFieldAction: {
      color: "#e06c75",
    },
    dividerLine: {
      background: "#355a66",
    },
    dividerText: {
      color: "color-mix(in srgb, #9cdef2 55%, #282c34)",
    },
    alertText: {
      color: "#9cdef2",
    },
    otpCodeFieldInput: {
      borderColor: "#355a66",
    },
  },
  layout: {
    socialButtonsPlacement: "bottom",
    showOptionalFields: true,
  },
};
