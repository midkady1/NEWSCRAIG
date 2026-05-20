const crypto = require('crypto');

const seen = new Map();

exports.isDuplicate = (text) => {
  const hash = crypto.createHash('sha256').update(text).digest('hex');

  if (seen.has(hash)) {
    return true;
  }

  seen.set(hash, Date.now());

  if (seen.size > 5000) {
    const first = seen.keys().next().value;
    seen.delete(first);
  }

  return false;
};
