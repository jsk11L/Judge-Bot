# Bot de Votación para Administradores de Discord

![Node.js](https://img.shields.io/badge/Node.js-16.x-339933?style=for-the-badge&logo=node.js)
![Discord.js](https://img.shields.io/badge/Discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?style=for-the-badge&logo=sqlite&logoColor=white)

**Judge-Bot** es un bot para servidores de Discord diseñado para gestionar **votaciones públicas para elegir nuevos administradores**. Permite a los miembros del servidor emitir un voto público (a favor o en contra) sobre un candidato, almacenando los resultados de forma transparente en una base de datos.

Este proyecto demuestra un manejo robusto de la API de Discord (Discord.js v14), persistencia de datos con SQLite y una arquitectura de software modular.

*(Te recomiendo agregar aquí un screenshot del bot en acción, por ejemplo, mostrando el comando `/instrucciones`)*
`![Demo de Judge-Bot](https://i.imgur.com/TU_FOTO.png)`

---

## 🚀 Características Principales

* **Sistema de Votación Pública:** Los miembros pueden votar por candidatos a administrador, y los votos son visibles.
* **Comandos de Barra Modernos:** Utiliza la última implementación de comandos de barra (`/`) de Discord.js para una experiencia de usuario limpia.
* **Persistencia de Datos:** Todas las votaciones se almacenan en una base de datos **SQLite**, garantizando que los recuentos sean precisos y persistentes, incluso si el bot se reinicia.
* **Arquitectura Modular:** El código está organizado con manejadores separados para los comandos (en la carpeta `commands/`) y los eventos del cliente (en la carpeta `events/`), siguiendo las mejores prácticas de desarrollo de bots.
* **Tareas Programadas:** Incluye un programador de tareas (`node-cron`) que puede usarse para cerrar votaciones automáticamente después de un tiempo determinado.

---

## 🤖 Comandos Disponibles

* `/favor [usuario]` - Emite un voto **a favor** del candidato a administrador mencionado.
* `/contra [usuario]` - Emite un voto **en contra** del candidato mencionado.
* `/desempate [usuario]` - Emite un voto especial de desempate.
* `/instrucciones` - Muestra un mensaje embed con las instrucciones sobre cómo funciona el sistema de votación.

---

## 🛠️ Tecnologías Utilizadas

* **Node.js**
* **Discord.js v14**
* **SQLite3** (para la base de datos)
* **node-cron** (para tareas programadas)
* **dotenv** (para gestión de variables de entorno)

---

## 🔧 Instalación y Ejecución Local

Puedes ejecutar este bot localmente siguiendo estos pasos:

1.  **Clonar el repositorio:**
    ```bash
    git clone [https://github.com/tu-usuario/Discord-Admin-VoteBot.git](https://github.com/tu-usuario/Discord-Admin-VoteBot.git)
    cd Discord-Admin-VoteBot
    ```

2.  **Instalar dependencias:**
    ```bash
    npm install
    ```

3.  **Configurar variables de entorno:**
    Crea un archivo `.env` en la raíz del proyecto y añade las credenciales de tu bot (puedes obtenerlas desde el [Portal de Desarrolladores de Discord](https://discord.com/developers/applications)):

    ```env
    TOKEN=EL_TOKEN_DE_TU_BOT
    CLIENT_ID=EL_CLIENT_ID_DE_TU_BOT
    GUILD_ID=EL_ID_DE_TU_SERVIDOR_DE_PRUEBAS
    ```

4.  **Registrar los comandos:**
    Ejecuta este script una vez para registrar los comandos de barra (`/`) en tu servidor de pruebas.
    ```bash
    node deploy-commands.js
    ```

5.  **Iniciar el bot:**
    ```bash
    node index.js
    ```
