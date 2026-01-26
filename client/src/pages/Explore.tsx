import { useState } from "react";
import { useCategories, useServices } from "@/hooks/use-mango-data";
import { ServiceCard } from "@/components/ServiceCard";
import { Input } from "@/components/ui/input";
import { Search, Filter, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function Explore() {
  const [search, setSearch] = useState("");
  const [location] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const initialCategory = params.get("category") || undefined;
  
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(initialCategory);

  const { data: categories } = useCategories();
  const { data: services, isLoading } = useServices({ 
    categoryId: selectedCategory, 
    search: search 
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="flex flex-col md:flex-row gap-8">
        
        {/* SIDEBAR FILTERS */}
        <aside className="w-full md:w-64 space-y-8 flex-shrink-0">
          <div>
            <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
              <Filter className="h-5 w-5" /> Filters
            </h3>
            
            <div className="space-y-2">
              <h4 className="font-semibold text-sm text-muted-foreground mb-2">Categories</h4>
              <button 
                onClick={() => setSelectedCategory(undefined)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${!selectedCategory ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'}`}
              >
                All Categories
              </button>
              {categories?.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(String(cat.id))}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedCategory === String(cat.id) ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'}`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <div className="flex-1">
          <div className="mb-8 space-y-4">
            <h1 className="text-3xl font-display font-bold text-foreground">Explore Services</h1>
            <div className="relative max-w-lg">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search services (e.g., plumbing, design)..."
                className="pl-10 h-12 rounded-xl border-border bg-white shadow-sm focus:ring-primary/20"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {isLoading ? (
             <div className="flex items-center justify-center h-64">
               <Loader2 className="h-8 w-8 animate-spin text-primary" />
             </div>
          ) : services?.length === 0 ? (
            <div className="text-center py-20 bg-muted/30 rounded-3xl border border-dashed border-border">
              <h3 className="text-xl font-bold mb-2">No services found</h3>
              <p className="text-muted-foreground">Try adjusting your filters or search terms.</p>
              <Button 
                variant="link" 
                className="mt-4 text-primary"
                onClick={() => { setSearch(""); setSelectedCategory(undefined); }}
              >
                Clear all filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {services?.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
