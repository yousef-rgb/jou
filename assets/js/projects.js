/* ==========================================================================
   Project links and media. Paste a URL to show its button; leave "" to hide it.
   - github: the project's repository
   - demo:   a live demo or video
   - paper:  the paper / dissertation PDF, e.g. "assets/papers/dissertation.pdf"
             (a .pdf can also be read inside the project window)
   - images: real figures / screenshots shown as a scrollable gallery in the
             project window. Put the files in assets/projects/<id>/ and list them:
             { src: "assets/projects/dr/gradcam.png",
               caption: { en: "Grad-CAM across blur levels", ar: "Grad-CAM عبر مستويات الضبابية" } }
   "profile" is shown in every project window as "More of my code on GitHub".
   ========================================================================== */
window.PROJECT_LINKS = {
  profile: "https://github.com/youssefeltayel",

  // Main projects
  dr: {                                         // Diabetic retinopathy dissertation
    github: "https://github.com/youssefeltayel/final-year-project", demo: "",
    paper: "assets/papers/dr-dissertation.pdf",   // only Youssef's name: student number and supervisor removed
    images: [],
  },
  robot: {                                      // Road inspection robot
    github: "https://github.com/youssefeltayel/limo-ros2-pothole-detection", demo: "", paper: "",
    images: [],
  },
  llm: {                                        // RDK Live: Youssef's prototype only, no client data
    github: "https://github.com/youssefeltayel/ai-elearning-path-generator", demo: "", paper: "",
    images: [],
  },

  // More projects
  m0: { github: "https://github.com/youssefeltayel/azure-first-project", demo: "", paper: "", images: [] },   // First project: face recognition on Azure
  m1: { github: "", demo: "", paper: "", images: [] },   // AI chatbot platform
  m2: { github: "", demo: "", paper: "", images: [] },   // Explainable AI and HCI
  m3: { github: "", demo: "", paper: "", images: [] },   // Data and AI governance
  m4: { github: "https://github.com/youssefeltayel/food-waste-app", demo: "", paper: "", images: [] },   // Food waste app
  m5: { github: "https://github.com/youssefeltayel/vr-living-space", demo: "", paper: "", images: [] },   // VR living space to ease loneliness
};
