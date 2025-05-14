# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/b7e2ad9d-0812-4760-b105-b67eeade0958

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/b7e2ad9d-0812-4760-b105-b67eeade0958) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/b7e2ad9d-0812-4760-b105-b67eeade0958) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)

## Setting up Google Cloud Speech-to-Text API

This application uses Google Cloud Speech-to-Text API for audio transcription in the Electron desktop version. To set it up:

1. Create a Google Cloud account if you don't have one: [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project in the Google Cloud Console
3. Enable the Speech-to-Text API for your project
4. Create a service account and download the JSON credentials file
5. Place the credentials file in the `electron` directory as `google-credentials.json`
6. Make sure your service account has the necessary permissions to use the Speech-to-Text API

For detailed instructions, see the [Google Cloud Speech-to-Text documentation](https://cloud.google.com/speech-to-text/docs/quickstart-client-libraries).

**IMPORTANT:** Keep your credentials secure and never commit them to version control. The `google-credentials.json` file is included in `.gitignore` by default.
