import Hero from "@/components/landing/Hero";
import WhyMatters from "@/components/landing/WhyMatters";
import DemoFeatures from "@/components/landing/DemoFeatures";
import ProductPreview from "@/components/landing/ProductPreview";
import About from "@/components/landing/About";
import Footer from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <Hero />
      <WhyMatters />
      <DemoFeatures />
      <ProductPreview />
      <About />
      <Footer />
    </div>
  );
}
