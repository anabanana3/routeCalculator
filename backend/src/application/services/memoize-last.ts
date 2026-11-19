/**
 * Memoriza un valor derivado de un objeto (p. ej. un Planner por red cargada):
 * se recalcula solo cuando cambia la identidad de la entrada.
 */
export function memoizeLast<I extends object, O>(fn: (input: I) => O): (input: I) => O {
  let lastInput: I | undefined;
  let lastOutput: O;
  return (input) => {
    if (input !== lastInput) {
      lastOutput = fn(input);
      lastInput = input;
    }
    return lastOutput;
  };
}
