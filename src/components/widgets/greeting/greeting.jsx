import { useSession } from "next-auth/react";

import Container from "../widget/container";
import Raw from "../widget/raw";

const textSizes = {
  "4xl": "text-4xl",
  "3xl": "text-3xl",
  "2xl": "text-2xl",
  xl: "text-xl",
  lg: "text-lg",
  md: "text-md",
  sm: "text-sm",
  xs: "text-xs",
};

function PersonalizedText({ fallback }) {
  const { data } = useSession();
  const name = (data?.user?.given_name || data?.user?.name || "").trim().split(/\s+/)[0];
  return name ? `Welcome home, ${name}.` : fallback;
}

export default function Greeting({ options }) {
  if (options.text) {
    return (
      <Container options={options} additionalClassNames="information-widget-greeting">
        <Raw>
          <span className={`text-theme-800 dark:text-theme-200 mr-3 ${textSizes[options.text_size || "xl"]}`}>
            {options.personalize ? <PersonalizedText fallback={options.text} /> : options.text}
          </span>
        </Raw>
      </Container>
    );
  }
}
