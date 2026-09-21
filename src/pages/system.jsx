// Keep bookmarked system links inside the shared settings navigation.
export function getServerSideProps() {
  return { redirect: { destination: "/settings?section=system", permanent: false } };
}
export default function SystemRedirect() {
  return null;
}
