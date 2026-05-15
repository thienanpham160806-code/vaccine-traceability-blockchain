interface PageProps {
  params: {
    serialId: string;
  };
}

export default function ConsumerVerifyPage({ params }: PageProps) {
  return (
    <div>
      Consumer Verify: {params.serialId}
    </div>
  );
}