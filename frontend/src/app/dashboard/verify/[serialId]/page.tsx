interface PageProps {
  params: {
    serialId: string;
  };
}

export default function VerifyPage({ params }: PageProps) {
  return (
    <div>
      Verify Serial: {params.serialId}
    </div>
  );
}