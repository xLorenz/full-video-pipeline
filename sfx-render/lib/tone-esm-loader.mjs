// Loader hook for tone's shipped ESM build on Node:
// 1. "standardized-audio-context" -> the shared CJS shim (see sac-shim.mjs).
// 2. tone's extensionless relative imports (e.g. "./core/Global") get ".js"
//    appended when the bare specifier is not found.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "standardized-audio-context") {
    return nextResolve(new URL("./sac-shim.mjs", import.meta.url).href, context);
  }
  const relative = specifier.startsWith("./") || specifier.startsWith("../");
  const ext = /\.(mjs|cjs|js|json|node)$/;
  if (relative && !ext.test(specifier)) {
    try {
      return await nextResolve(specifier, context);
    } catch (err) {
      if (err && err.code === "ERR_MODULE_NOT_FOUND") {
        return nextResolve(specifier + ".js", context);
      }
      throw err;
    }
  }
  return nextResolve(specifier, context);
}