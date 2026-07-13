export const TIME_SLOT_TEXT_PATTERN = /(\d{1,2}:\d{2}\s*(AM|PM))/i;

export const selectors = {
  findTableButton: 'button:has-text("Find a table")',
  timeSlotButton: (time12) => `button:has-text("${time12}")`,
  // Legacy UI: a separate "Select" button under each seating option.
  seatingSelectButton: 'button:has-text("Select")',
  // Current UI: seating options are the buttons themselves (Standard / High Top / Outdoor / …).
  seatingOptionButtons:
    'button:has-text("Standard"), button:has-text("High Top"), button:has-text("Outdoor"), button:has-text("Bar"), button:has-text("Patio"), button:has-text("Counter")',
  seatingHeading: 'text=Select a seating option',
  completeReservationButton: 'button:has-text("Complete reservation")',

  firstNameInput: 'input[name="firstName"], input[placeholder*="First name"]',
  lastNameInput: 'input[name="lastName"], input[placeholder*="Last name"]',
  phoneInput: 'input[name="phoneNumber"], input[type="tel"], input[placeholder*="Phone"]',
  emailInput: 'input[name="email"], input[type="email"], input[placeholder*="Email"]',
  specialRequestTextarea: 'textarea',

  emailMarketingLabel: 'label:has-text("dining offers")',
  smsReminderLabel: 'label:has-text("text updates")',

  cookieAcceptButton:
    'button:has-text("Accept all"), button:has-text("Accept All"), button:has-text("Allow all"), button:has-text("Confirm my choices")',
  cookieCloseButton: '[aria-label="Close"]',

  errorMessage: '[class*="error"], [class*="Error"], [role="alert"]',
};
