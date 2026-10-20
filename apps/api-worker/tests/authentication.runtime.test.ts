// One entry file: the cases share one built bundle and run serially; separate files each build and boot their own Miniflare, contend for CPU and exceed the test timeout.
import { registerAuthenticationRuntime } from "./authenticationRuntimeHarness";
import "./authenticationRuntimeAccountTests";
import "./authenticationRuntimeAccountLifecycleTests";
import "./authenticationRuntimeRecoveryTests";
import "./authenticationRuntimeRecoveryAuthorityTests";
import "./authenticationRuntimeVerificationTests";
import "./authenticationRuntimeThrottlingTests";
import "./authenticationRuntimeHumanChallengeTests";
import "./authenticationRuntimeClassifiedsTests";
import "./authenticationRuntimeCanonicalTests";
import "./authenticationRuntimePhotosTests";
import "./authenticationRuntimeMediaTests";
import "./authenticationRuntimeExpiryTests";
import "./authenticationRuntimeBlogTests";
import "./authenticationRuntimeBlogPublicTests";
import "./authenticationRuntimeEditorialImageTests";

registerAuthenticationRuntime();
