type PartialResultBannerProps = {
  message?: string;
};

export function PartialResultBanner({
  message = "This response may be incomplete.",
}: PartialResultBannerProps) {
  return (
    <div className="nexus-banner nexus-banner-warning" role="status">
      {message}
    </div>
  );
}
