import Container from "../widget/container";
import Raw from "../widget/raw";

import GatherMark from "components/gather/mark";
import ResolvedIcon from "components/resolvedicon";

export default function Logo({ options }) {
  return (
    <Container
      options={options}
      additionalClassNames={`information-widget-logo ${options.icon ? "resolved" : "fallback"}`}
    >
      <Raw>
        {options.icon ? (
          <div className="resolved mr-3">
            <ResolvedIcon icon={options.icon} width={48} height={48} />
          </div>
        ) : (
          <div className="fallback w-12 h-12">
            <GatherMark className="w-full h-full" />
          </div>
        )}
      </Raw>
    </Container>
  );
}
