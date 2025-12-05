require('@testing-library/jest-dom');

// Mock React's cache function for Jest
jest.mock('react', () => {
  const actualReact = jest.requireActual('react');
  return {
    ...actualReact,
    cache: (fn) => fn, // In tests, cache is a no-op that just returns the function
  };
});
