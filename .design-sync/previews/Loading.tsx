import { Loading } from "macae-classificados";

export const Default = () => <Loading />;

export const InCard = () => (
  <div className="rounded-lg border">
    <Loading className="m-0 py-12" />
  </div>
);
