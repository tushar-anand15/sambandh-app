interface TextPaneProps {
  text: string;
}

export default function TextPane({ text }: TextPaneProps) {
  if (!text) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-ink-faint">No extracted text available</p>
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="prose-sm max-w-none">
        {text.split("\n\n").map((paragraph, i) => (
          <p
            key={i}
            className="mb-3 text-[13.5px] leading-[1.75] text-ink"
          >
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
}
