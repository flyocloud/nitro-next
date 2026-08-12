require('@testing-library/jest-dom');

// Stand in for React's `cache()`, which needs a request scope Jest does not
// have. At runtime Next.js scopes it per request, so a `cache()`d function is
// called once per distinct argument list and every caller in that request sees
// the same value — which is what the request-scoped stores in server.tsx (the
// language-links channel, the JSON-LD claim set) are built on.
//
// The memo lives on the returned function, so it is created fresh every time a
// module calls `cache(fn)` — i.e. once per module load. Tests that need a clean
// "request" therefore load `./server` through `jest.isolateModules()`, and tests
// that must re-run a cached fetch reset the modules between them.
jest.mock('react', () => {
  const actualReact = jest.requireActual('react');
  return {
    ...actualReact,
    cache: (fn) => {
      const memo = new Map();
      return (...args) => {
        const key = JSON.stringify(args);
        if (!memo.has(key)) {
          memo.set(key, fn(...args));
        }
        return memo.get(key);
      };
    },
  };
});
