import { Redirect } from "wouter";

/** Legacy: Shop Go ya no vive dentro del shell Car Go. */
export default function GoShop() {
  return <Redirect to="/marketplace" />;
}

