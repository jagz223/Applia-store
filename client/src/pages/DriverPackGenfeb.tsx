import { Redirect } from "wouter";

/** Legacy: `/go/delivery/driver` redirige al panel unificado. */
export default function DriverPackGenfeb() {
  return <Redirect to="/go/driver" />;
}
