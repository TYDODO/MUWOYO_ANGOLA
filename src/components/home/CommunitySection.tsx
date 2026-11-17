import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import communityOriginal from "@/assets/landing/community.png";

export default function CommunitySection() {
  const navigate = useNavigate();

  return (
    <section id="comunidade" className="py-20 lg:py-28 bg-background relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          className="max-w-6xl mx-auto"
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          {/* Header */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-16 lg:mb-24">
            {/* Image */}
            <div className="flex justify-center lg:justify-start order-2 lg:order-1">
              <motion.img
                src={communityOriginal}
                alt="Comunidade Muwoyo"
                className="block w-full max-w-md h-auto rounded-2xl shadow-2xl object-cover"
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
              />
            </div>

            {/* Content */}
            <div className="space-y-6 order-1 lg:order-2">
              <div className="space-y-3">
                <p className="text-sm font-semibold text-primary uppercase tracking-wider">
                  Junte-se à comunidade
                </p>
                <h2 className="text-4xl lg:text-5xl font-bold text-foreground">
                  Comunidade de
                  <br />
                  <span className="text-primary">Empreendedores Muwoyo</span>
                </h2>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Faça parte de uma comunidade vibrante de negociantes que usam
                  Muwoyo para transformar seus negócios. Compartilhe experiências,
                  aprenda com outros, e cresça junto.
                </p>
              </div>

              <button
                onClick={() => navigate("/login")}
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl w-full sm:w-auto"
              >
                Conhecer a Comunidade
              </button>
            </div>
          </div>

        </motion.div>
      </div>
    </section>
  );
}
