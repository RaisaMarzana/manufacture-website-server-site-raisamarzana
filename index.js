const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const ObjectId = require('mongodb').ObjectId;
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);


const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.l7255bf.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    });
}

async function run() {
    try {
        await client.connect()
        const toolsCollection = client.db('carParts').collection('tools');
        const userCollection = client.db('carParts').collection('user');
        const ordersCollection = client.db('carParts').collection('orders');
        const reviewsCollection = client.db('carParts').collection('reviews');
        const paymentCollection = client.db('carParts').collection('payments');

        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({ clientSecret: paymentIntent.client_secret })
        });

        //Getting all tools data
        app.get('/tools', async (req, res) => {
            const query = {};
            const cursor = toolsCollection.find(query);
            const tools = await cursor.toArray();
            res.send(tools);
        })

        // Getting single tool data
        app.get('/tools/:_id', async (req, res) => {
            const _id = req.params._id
            const query = { _id: ObjectId(_id) }
            const tool = await toolsCollection.findOne(query)
            res.send(tool)
        })

        // Add new tool
        app.post('/tools', async (req, res) => {
            const newTool = req.body
            const result = await toolsCollection.insertOne(newTool)
            res.send(result)
        })

        // Updating tool quantity after purchase
        app.put('/tools/:_id', verifyJWT, async (req, res) => {
            const _id = req.params._id
            const filter = { _id: ObjectId(_id) }
            const newQuantity = req.body.newQuantity
            const options = { upsert: true }
            const updatedDoc = {
                $set: {
                    quantity: newQuantity
                }
            }
            const result = await toolsCollection.updateOne(filter, updatedDoc, options)
            res.send(result)
        })

        // Deleting Tools
        app.delete('/tools/:_id', verifyJWT, async (req, res) => {
            const _id = req.params._id;
            const filter = { _id: ObjectId(_id) };
            const result = await toolsCollection.deleteOne(filter);
            res.send(result);
        })

        // Storing user data in database
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '24d' });
            res.send({ result, token });
        })

        // Updating individual user data
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const updateProfile = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updatedDoc = {
                $set: updateProfile,
            };
            const result = await userCollection.updateOne(filter, updatedDoc, options);
            res.send(result);
        })

        // Get Individual user data
        app.get('/user/:email', async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const result = await userCollection.findOne(filter);
            res.send(result);
        })

        // Assign Admin role
        app.put('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        // Checking which user has admin role
        app.get('/user/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            res.send({ admin: isAdmin })
        })

        // Get all user info
        app.get('/user', verifyJWT, async (req, res) => {
            const query = {}
            const result = await userCollection.find(query).toArray()
            res.send(result)
        })

        // Deleting Users
        app.delete('/user/:_id', verifyJWT, async (req, res) => {
            const _id = req.params._id;
            const filter = { _id: ObjectId(_id) };
            const result = await userCollection.deleteOne(filter);
            res.send(result);
        })

        // Getting all orders of an user
        app.get('/order/:email', async (req, res) => {
            const email = req.params.email
            const query = { email: email }
            const yourOrder = await ordersCollection.find(query).toArray()
            res.send(yourOrder)
        })

        app.get('/orders/:_id', async (req, res) => {
            const _id = req.params._id
            const query = { _id: ObjectId(_id) }
            const orderInfo = await ordersCollection.findOne(query)
            res.send(orderInfo)
        })

        // Adding new order
        app.post('/order', verifyJWT, async (req, res) => {
            const order = req.body
            const result = await ordersCollection.insertOne(order)
            res.send(result)
        })

        // Getting all order
        app.get('/order', async (req, res) => {
            const result = await ordersCollection.find().toArray()
            res.send(result)
        })



        // Deleting Orders
        app.delete('/order/:_id', verifyJWT, async (req, res) => {
            const _id = req.params._id;
            const filter = { _id: ObjectId(_id) };
            const result = await ordersCollection.deleteOne(filter);
            res.send(result);
        })



        // Set information after payment
        app.patch('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }

            const result = await paymentCollection.insertOne(payment);
            const updatedBooking = await ordersCollection.updateOne(filter, updatedDoc);
            res.send({ updatedBooking, result });
        })

        // Assign Shipped status
        app.put('/order/shipped/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const updateDoc = {
                $set: { shipped: 'true' },
            };
            const result = await ordersCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        // Post user review
        app.post('/reviews', verifyJWT, async (req, res) => {
            const review = req.body;
            const result = await reviewsCollection.insertOne(review);
            res.send(result);
        })

        // Load Reviews
        app.get('/reviews', async (req, res) => {
            const results = await reviewsCollection.find().toArray();
            res.send(results);
        })
    }
    finally {

    }
}
run().catch(console.dir)

// ROOT API
app.get('/', (req, res) => {
    res.send('CarParts server is running')
})

app.listen(port, () => {
    console.log('Listening to ', port)
})