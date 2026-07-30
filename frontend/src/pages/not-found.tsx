export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-foreground">404</h1>
        <p className="text-muted-foreground">Page not found</p>
        <a href="/" className="text-primary hover:underline">Go home</a>
      </div>
    </div>
  );
}
