const formatMeta = (meta) => {
  if (!meta || Object.keys(meta).length === 0) return '';
  return ` ${JSON.stringify(meta)}`;
};

export const Logger = {
  info: (message, meta = {}) => {
    console.log(`[INFO] ${message}${formatMeta(meta)}`);
  },
  error: (message, meta = {}) => {
    console.error(`[ERROR] ${message}${formatMeta(meta)}`);
  },
};
