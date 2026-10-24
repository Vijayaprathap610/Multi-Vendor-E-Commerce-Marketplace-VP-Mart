// Validates body/query/params with zod and exposes the parsed result on req.valid.
// Raw req.body is never trusted past this point; schemas are strict so unknown fields
// (mass-assignment attempts such as "role" or "status") are rejected.
export const validate = (schemas) => (req, _res, next) => {
  req.valid = {};
  for (const key of ['params', 'query', 'body']) {
    if (!schemas[key]) continue;
    const result = schemas[key].safeParse(req[key] ?? {});
    if (!result.success) throw result.error;
    req.valid[key] = result.data;
  }
  next();
};
