import { useRef, useState } from "react";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { TermsContent } from "@/components/legal/TermsContent";

interface TermsOfUseProps {
  onAccept: () => void;
  onReject: () => void;
}

export function TermsOfUse({ onAccept, onReject }: TermsOfUseProps) {
  const [accepted, setAccepted] = useState(false);
  const [scrollBottom, setScrollBottom] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    setScrollBottom(element.scrollHeight - element.scrollTop <= element.clientHeight + 10);
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <CardHeader>
          <CardTitle className="text-2xl">Termos de Uso</CardTitle>
          <CardDescription>Última actualização: 17 de Novembro de 2026</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea
            ref={scrollAreaRef}
            className="mb-6 h-[60vh] p-0"
            onScrollCapture={handleScroll}
          >
            <TermsContent />
          </ScrollArea>

          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="accept-terms"
                checked={accepted}
                onCheckedChange={(checked) => setAccepted(checked === true)}
                disabled={!scrollBottom}
              />
              <Label
                htmlFor="accept-terms"
                className={!scrollBottom ? "text-muted-foreground" : ""}
              >
                {!scrollBottom
                  ? "Por favor, leia até ao final para activar a aceitação"
                  : "Li e concordo com os Termos de Uso"}
              </Label>
            </div>

            <div className="flex gap-3">
              <Button onClick={onReject} variant="outline" className="flex-1">
                Recusar
              </Button>
              <Button onClick={onAccept} disabled={!accepted} className="flex-1">
                Aceitar
              </Button>
            </div>
          </div>
        </CardContent>
      </div>
    </div>
  );
}
