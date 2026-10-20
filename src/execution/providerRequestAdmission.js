export const PROVIDER_REQUEST_ADMISSION = Symbol("providerRequestAdmission");

// Only explicit pre-dispatch rejection can cancel a reservation, never a transport failure.
export function createProviderRequestAdmission(cancelReservation) {
  let state = "RESERVED";
  return Object.freeze({
    markDispatched() {
      if (state !== "RESERVED") throw new Error("Provider request reservation is no longer available for dispatch.");
      state = "DISPATCHED";
    },
    rejectBeforeDispatch() {
      if (state !== "RESERVED") return;
      state = "REJECTED_BEFORE_DISPATCH";
      cancelReservation?.();
    },
  });
}
