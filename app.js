const express = require("express");
const app = express();
var csrf = require("tiny-csrf");
const bodyParser = require("body-parser");
var cookieParser = require("cookie-parser");
app.use(bodyParser.json());
const path = require("path");
const passport = require("passport");
const connectEnsureLogin = require("connect-ensure-login");
const session = require("express-session");
const LocalStrategy = require("passport-local");
const bcrypt = require("bcrypt");
const saltRounds = 10;
const { Todo, User } = require("./models");
// eslint-disable-next-line no-unused-vars
const todo = require("./models/todo");
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: "my-super-secret-key-354687684523",
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, //24hrs
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

passport.use(
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
    },
    (username, password, done) => {
      User.findOne({ where: { email: username } })
        .then(async (user) => {
          const result = await bcrypt.compare(password, user.password);
          if (result) {
            return done(null, user);
          } else {
            return done("Invalid Password");
          }
        })
        .catch((error) => {
          return error;
        });
    }
  )
);

passport.serializeUser((user, done) => {
  console.log("Serializing user in session", user.id);
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findByPk(id)
    .then((user) => {
      done(null, user);
    })
    .catch((error) => {
      done(error, null);
    });
});

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser("shh! some secret string"));
app.use(csrf("this_should_be_32_character_long", ["POST", "PUT", "DELETE"]));
app.set("view engine", "ejs");

app.get("/", async (request, response) => {
  response.render("index", {
    title: "Todo Application",
    csrfToken: request.csrfToken(),
  });
});

app.get(
  "/todos",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const loggedInUser = request.user.id;
    const allTodos = await Todo.getTodos(loggedInUser);
    const overdue = await Todo.overdue(loggedInUser);
    const dueLater = await Todo.dueLater(loggedInUser);
    const dueToday = await Todo.dueToday(loggedInUser);
    const completedItems = await Todo.completedItems(loggedInUser);
    if (request.accepts("html")) {
      response.render("todo", {
        title: "Todo Application",
        allTodos,
        overdue,
        dueLater,
        dueToday,
        completedItems,
        csrfToken: request.csrfToken(),
      });
    } else {
      response.json(overdue, dueLater, dueToday, completedItems);
    }
  }
);

app.get("/signup", (request, response) => {
  response.render("signup", {
    title: "Signup",
    csrfToken: request.csrfToken(),
  });
});

app.post("/users", async (request, response) => {
  //create the user
  //console.log(request.body.firstName);
  //Hashing password using bcrypt
  const hashedPwd = await bcrypt.hash(request.body.password, saltRounds);
  try {
    const user = await User.create({
      firstName: request.body.firstName,
      lastName: request.body.lastName,
      email: request.body.email,
      password: hashedPwd,
    });
    request.login(user, (error) => {
      if (error) {
        console.log(error);
      }
      response.redirect("/todos");
    });
  } catch (error) {
    console.log(error);
  }
});

app.get("/login", (request, response) => {
  response.render("login", { title: "Login", csrfToken: request.csrfToken() });
});

app.post(
  "/session",
  passport.authenticate("local", { failureRedirect: "/login" }),
  (request, response) => {
    response.redirect("/todos");
  }
);

app.get("/signout", (request, response, next) => {
  //Signout user
  request.logout((err) => {
    if (err) {
      return next(err);
    }
    response.redirect("/");
  });
});

app.get("/todos", async (request, response) => {
  // defining route to displaying message
  console.log("Todo list");
  try {
    const todoslist = await Todo.findAll();
    return response.json(todoslist);
  } catch (error) {
    console.log(error);
    return response.status(422).json(error);
  }
});
app.get("/todos/:id", async function (request, response) {
  try {
    const todo = await Todo.findByPk(request.params.id);
    return response.json(todo);
  } catch (error) {
    console.log(error);
    return response.status(422).json(error);
  }
});

app.post(
  "/todos",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    console.log("creating new todo", request.body);
    console.log(request.user);
    try {
      // eslint-disable-next-line no-unused-vars
      await Todo.addTodo({
        title: request.body.title,
        dueDate: request.body.dueDate,
        commpleted: false,
        userId: request.user.id,
      });
      return response.redirect("/todos");
    } catch (error) {
      console.log(error);
      return response.status(422).json(error);
    }
  }
);
//PUT https://mytodoapp.com/todos/123/markAscomplete
app.put(
  "/todos/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    console.log("Mark Todo as completed:", request.params.id);
    const todo = await Todo.findByPk(request.params.id);
    try {
      const updatedtodo = await todo.setCompletionStatus(
        request.body.completed
      );
      return response.json(updatedtodo);
    } catch (error) {
      console.log(error);
      return response.status(422).json(error);
    }
  }
);
app.delete(
  "/todos/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    console.log("delete a todo with ID:", request.params.id);
    try {
      await Todo.remove(request.params.id);
      return response.json({ success: true });
    } catch (error) {
      return response.status(422).json(error);
    }
  }
);
module.exports = app;
