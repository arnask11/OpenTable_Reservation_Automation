function maskEmail(email) {
  if (!email) return undefined;
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  const visible = user.slice(0, 1);
  return `${visible}***@${domain}`;
}

function maskPhone(phone) {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  return `***${digits.slice(-4)}`;
}

function log(step, data = {}) {
  console.log(JSON.stringify({ step, timestamp: new Date().toISOString(), ...data }));
}

function logError(step, error, data = {}) {
  console.error(
    JSON.stringify({ step, timestamp: new Date().toISOString(), message: error?.message, ...data })
  );
}

export const logger = { log, logError, maskEmail, maskPhone };
