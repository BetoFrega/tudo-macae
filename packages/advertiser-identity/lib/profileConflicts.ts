export class AdvertiserProfileRevisionConflict extends Error {
  constructor(readonly currentRevision: number) {
    super("Advertiser profile revision changed");
    this.name = "AdvertiserProfileRevisionConflict";
  }
}

export class AdvertiserProfileCreationPayloadConflict extends Error {
  constructor(readonly profileId: string) {
    super("Advertiser profile already created with different fields");
    this.name = "AdvertiserProfileCreationPayloadConflict";
  }
}

export class AdvertiserIdentityTypeConflict extends Error {
  constructor(readonly reason: "personal-exists" | "already-classified") {
    super(reason === "personal-exists"
      ? "Account already has a personal profile"
      : "Advertiser profile type is already confirmed");
    this.name = "AdvertiserIdentityTypeConflict";
  }
}
