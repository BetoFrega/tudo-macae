// Argument arity follows the pinned Playwright CLI. Required values may start
// with a dash; optional and variadic values end at the next option.
const switches = new Set([
  "--fail-on-flaky-tests", "--forbid-only", "--fully-parallel", "--headed",
  "--ignore-snapshots", "--last-failed", "--list", "--no-deps",
  "--pass-with-no-tests", "--quiet", "--ui", "-x", "-h", "--help", "-V", "--version",
]);
const optionalValues = new Set(["--debug", "--only-changed", "--update-snapshots", "-u"]);
type PendingValue = { option: string; mode: "required" | "optional" | "variadic" };

function configurationAlias(value: string) {
  return /^(?:\.\/)?playwright(?:\.(?:full|harness|harness-app))?\.config\.ts$/.test(value)
    ? value.replace(/^(?:\.\/)?playwright/, "tests/e2e/playwright")
    : value;
}

type OptionValueListener = ((option: string, value: string) => void) | undefined;
type ParsedArgument = { argument: string; valueFor?: PendingValue | undefined };

function pendingValueFor(option: string): PendingValue {
  return { option, mode: optionalValues.has(option) ? "optional" : "required" };
}

function acceptsValue(valueFor: PendingValue, argument: string) {
  return valueFor.mode === "required" || !argument.startsWith("-");
}

function optionValue({ option }: PendingValue, argument: string, onOptionValue: OptionValueListener): ParsedArgument {
  const value = option === "--config" || option === "-c"
    ? configurationAlias(argument)
    : argument;
  onOptionValue?.(option, value);
  return {
    argument: value,
    valueFor: option === "--project" ? { option, mode: "variadic" } : undefined,
  };
}

function longOption(argument: string, onOptionValue: OptionValueListener): ParsedArgument {
  if (argument.startsWith("--config=")) {
    const value = configurationAlias(argument.slice("--config=".length));
    onOptionValue?.("--config", value);
    return { argument: `--config=${value}` };
  }
  const separator = argument.indexOf("=");
  if (separator >= 0) {
    onOptionValue?.(argument.slice(0, separator), argument.slice(separator + 1));
    return { argument };
  }
  return { argument, valueFor: switches.has(argument) ? undefined : pendingValueFor(argument) };
}

// Commander permits joined short values and clusters such as -xc.
function shortOptionCluster(argument: string, onOptionValue: OptionValueListener): ParsedArgument {
  for (let index = 1; index < argument.length; index++) {
    const option = `-${argument[index]}`;
    if (switches.has(option)) continue;
    const joinedValue = argument.slice(index + 1);
    if (!joinedValue) return { argument, valueFor: pendingValueFor(option) };
    const value = option === "-c" ? configurationAlias(joinedValue) : joinedValue;
    onOptionValue?.(option, value);
    if (option === "-c") return { argument: `${argument.slice(0, index + 1)}${value}` };
    return { argument };
  }
  return { argument };
}

export function playwrightArguments(
  arguments_: string[],
  onOptionValue?: (option: string, value: string) => void,
) {
  let valueFor: PendingValue | undefined;
  let trailingArguments = false;
  const parse = (parsed: ParsedArgument) => {
    valueFor = parsed.valueFor;
    return parsed.argument;
  };
  return arguments_.map((argument) => {
    if (trailingArguments) return argument;
    if (valueFor && acceptsValue(valueFor, argument)) return parse(optionValue(valueFor, argument, onOptionValue));
    valueFor = undefined;
    if (argument === "--") {
      trailingArguments = true;
      return argument;
    }
    if (argument.startsWith("--")) return parse(longOption(argument, onOptionValue));
    if (argument.startsWith("-")) return parse(shortOptionCluster(argument, onOptionValue));
    return argument.replace(/^(?:\.\/)?tests\/(?!e2e\/)/, "tests/e2e/");
  });
}
